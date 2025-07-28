import React, { useState, useEffect } from 'react';
import styles from './RightPanel.module.css';
import { useUIStore } from '@/store/uiStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import ColumnProperties from '@/editor/shared/controls/structure/ColumnProperties';

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
          width="18" 
          height="18" 
          viewBox="0 0 24 24" 
          fill="none" 
          className={`${styles.expandIcon} ${expanded ? styles.expanded : ''}`}
        >
          <polyline points="6,9 12,15 18,9" stroke="currentColor" strokeWidth="2"/>
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

const ToggleGroup: React.FC<ToggleGroupProps> = ({ options, selected, onChange }) => (
  <div className={styles.toggleGroup}>
    {options.map((option) => (
      <button
        key={option.id}
        className={`${styles.toggleButton} ${selected === option.id ? styles.active : ''}`}
        onClick={() => onChange(option.id)}
      >
        {option.label}
      </button>
    ))}
  </div>
);

// 도어 슬라이더 컴포넌트
interface DoorSliderProps {
  value: number;
  onChange: (value: number) => void;
  width: number; // 공간 넓이
}

const DoorSlider: React.FC<DoorSliderProps> = ({ value, onChange, width }) => {
  const [isDragging, setIsDragging] = useState(false);
  const { spaceInfo } = useSpaceConfigStore();
  
  // 도어 1개 너비 (588mm)
  const DOOR_WIDTH = 588;
  
  // 단내림이 활성화된 경우 메인 구간의 폭 계산
  const getMainZoneWidth = () => {
    if (spaceInfo.droppedCeiling?.enabled) {
      // 단내림 활성화 시 전체 폭에서 단내림 폭을 뺀 나머지가 메인 구간
      const mainZoneWidth = width - (spaceInfo.droppedCeiling.width || 900);
      console.log('🎯 메인 구간 폭 계산 (DoorSlider):', {
        totalWidth: width,
        droppedWidth: spaceInfo.droppedCeiling.width || 900,
        mainZoneWidth
      });
      return mainZoneWidth;
    }
    return width;
  };
  
  // 단내림 구간의 폭 계산 (단내림 구간 도어개수 슬라이더용)
  const getDroppedCeilingWidth = () => {
    if (spaceInfo.droppedCeiling?.enabled) {
      return spaceInfo.droppedCeiling.width || 900;
    }
    return width;
  };
  
  // 공간 넓이 기반 최소/최대 도어 개수 계산
  const calculateDoorRange = (spaceWidth: number) => {
    // 단내림이 활성화된 경우 ColumnIndexer.ts의 calculateZoneSlotInfo와 동일한 공식 적용
    if (spaceInfo.droppedCeiling?.enabled) {
      const frameThickness = 50; // 프레임 두께
      const normalAreaInternalWidth = spaceWidth - frameThickness;
      const MAX_SLOT_WIDTH = 600; // 슬롯 최대 너비 제한
      const MIN_SLOT_WIDTH = 400; // 슬롯 최소 너비 제한
      
      // 최소 필요 슬롯 개수 (600mm 제한)
      const minRequiredSlots = Math.ceil(normalAreaInternalWidth / MAX_SLOT_WIDTH);
      // 최대 가능 슬롯 개수 (400mm 제한)
      const maxPossibleSlots = Math.floor(normalAreaInternalWidth / MIN_SLOT_WIDTH);
      
      console.log('🎯 단내림 활성화 시 슬롯 계산 (ColumnIndexer 공식):', {
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
    
    // 단내림이 비활성화된 경우 기존 로직
    const FRAME_MARGIN = 100; // 양쪽 50mm씩
    const usableWidth = spaceWidth - FRAME_MARGIN;
    
    // 슬롯 크기 제약 조건 (400mm ~ 600mm)
    const MIN_SLOT_WIDTH = 400;
    const MAX_SLOT_WIDTH = 600;
    
    // 실제 설치 가능한 최소/최대 도어 개수 계산
    const minPossible = Math.max(1, Math.ceil(usableWidth / MAX_SLOT_WIDTH)); // 슬롯 최대 600mm
    const maxPossible = Math.min(20, Math.floor(usableWidth / MIN_SLOT_WIDTH)); // 슬롯 최소 400mm
    
    // 이상적인 도어 개수 (588mm 기준)
    const idealDoorCount = Math.round(usableWidth / DOOR_WIDTH);
    
    return {
      min: minPossible,
      max: maxPossible,
      ideal: idealDoorCount
    };
  };
  
  // 도어 범위 계산 - 단내림 구간의 도어개수 슬라이더인지 확인
  // 단내림 구간 슬라이더는 width가 단내림 폭과 같거나, 단내림이 활성화되어 있고 width가 900 이하일 때
  const isDroppedCeilingSlider = spaceInfo.droppedCeiling?.enabled && 
    (width === (spaceInfo.droppedCeiling.width || 900) || width <= 900);
  
  let doorRange;
  if (isDroppedCeilingSlider) {
    // 단내림 구간의 도어개수 슬라이더인 경우
    doorRange = calculateDoorRange(width);
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
    doorRange = calculateDoorRange(mainZoneWidth);
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
  const getDoorCountFromPosition = (position: number) => {
    const normalizedPosition = Math.max(0, Math.min(100, position));
    const doorCount = Math.round(minDoors + (normalizedPosition / 100) * (maxDoors - minDoors));
    return Math.max(minDoors, Math.min(maxDoors, doorCount));
  };
  
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  
  const handleMouseMove = (e: React.MouseEvent | MouseEvent) => {
    if (!isDragging) return;
    
    const sliderTrack = document.querySelector(`.${styles.sliderTrack}`);
    if (!sliderTrack) return;
    
    const rect = sliderTrack.getBoundingClientRect();
    const position = ((e.clientX - rect.left) / rect.width) * 100;
    const newDoorCount = getDoorCountFromPosition(position);
    
    if (newDoorCount !== value) {
      onChange(newDoorCount);
    }
  };
  
  const handleMouseUp = () => {
    setIsDragging(false);
  };
  
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
  }, [isDragging, value]);
  
  // 값이 범위를 벗어나면 자동 조정
  React.useEffect(() => {
    if (clampedValue !== value) {
      onChange(clampedValue);
    }
  }, [clampedValue, value]);

  // width 또는 단내림 설정 변경 시 현재 값이 새로운 범위를 벗어나면 자동 조정
  React.useEffect(() => {
    const mainZoneWidth = getMainZoneWidth();
    const range = calculateDoorRange(mainZoneWidth);
    
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
      // 도어 개수가 8개 이하면 모든 값 표시
      const labels = [];
      for (let i = minDoors; i <= maxDoors; i++) {
        labels.push(i);
      }
      console.log('🎯 생성된 라벨:', labels);
      return labels;
    } else {
      // 도어 개수가 많으면 대표값들만 표시
      const labels = [];
      const step = Math.ceil(doorCount / 7);
      for (let i = minDoors; i <= maxDoors; i += step) {
        labels.push(i);
      }
      // 마지막 값이 maxDoors가 아니면 추가
      if (labels[labels.length - 1] !== maxDoors) {
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
    <div className={styles.doorSlider}>
      <div 
        className={styles.sliderTrack}
      >
        {/* 활성 트랙 */}
        <div 
          className={styles.sliderActiveTrack}
          style={{ width: `${sliderPosition}%` }}
        />
        
        {/* 슬라이더 핸들 */}
        <div 
          className={styles.sliderHandle}
          style={{ left: `${sliderPosition}%` }}
          onMouseDown={handleMouseDown}
        />
      </div>
      
      {/* 슬라이더 라벨 */}
      <div className={styles.sliderLabels}>
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
  
  // 도어 개수
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
  const { spaceInfo } = useSpaceConfigStore();
  const { setActiveDroppedCeilingTab } = useUIStore();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['brand', 'price', 'material', 'space', 'mainSpace', 'layout', 'floor', 'frame'])
  );
  
  // 초기 렌더링 시 UIStore 동기화
  useEffect(() => {
    if (spaceInfo.droppedCeiling?.enabled) {
      setActiveDroppedCeilingTab(activeTab === 'placement' ? 'main' : 'dropped');
    }
  }, [activeTab, spaceInfo.droppedCeiling?.enabled, setActiveDroppedCeilingTab]);

  // 도어 개수 범위 계산
  const DOOR_WIDTH = 588;
  
  // 단내림이 활성화된 경우 메인 구간의 폭 계산
  const getMainZoneWidth = () => {
    if (spaceInfo.droppedCeiling?.enabled) {
      // 단내림 활성화 시 전체 폭에서 단내림 폭을 뺀 나머지가 메인 구간
      const mainZoneWidth = width - (spaceInfo.droppedCeiling.width || 900);
      console.log('🎯 메인 구간 폭 계산 (RightPanel):', {
        totalWidth: width,
        droppedWidth: spaceInfo.droppedCeiling.width || 900,
        mainZoneWidth
      });
      return mainZoneWidth;
    }
    return width;
  };
  
  const calculateDoorRange = (spaceWidth: number) => {
    // 양쪽 여백 고려 (프레임 등)
    const FRAME_MARGIN = 100; // 양쪽 50mm씩
    const usableWidth = spaceWidth - FRAME_MARGIN;
    
    // 슬롯 크기 제약 조건 (400mm ~ 600mm)
    const MIN_SLOT_WIDTH = 400;
    const MAX_SLOT_WIDTH = 600;
    
    // 실제 설치 가능한 최소/최대 도어 개수 계산
    const minPossible = Math.max(1, Math.ceil(usableWidth / MAX_SLOT_WIDTH)); // 슬롯 최대 600mm
    const maxPossible = Math.min(20, Math.floor(usableWidth / MIN_SLOT_WIDTH)); // 슬롯 최소 400mm
    
    // 이상적인 도어 개수 (588mm 기준)
    const idealDoorCount = Math.round(usableWidth / DOOR_WIDTH);
    
    return {
      min: minPossible,
      max: maxPossible,
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
    { id: 'placement' as RightPanelTab, label: '메인구간' },
    { id: 'module' as RightPanelTab, label: '단내림 구간' }
  ] : [
    { id: 'placement' as RightPanelTab, label: '배치 속성' },
    { id: 'module' as RightPanelTab, label: '모듈 속성' }
  ];

  const installTypes = [
    { id: 'builtin', label: '양쪽벽' },
    { id: 'semistanding', label: '한쪽벽' },
    { id: 'freestanding', label: '벽없음' }
  ];

  const materialOptions = [
    { id: 'white', label: '화이트' },
    { id: 'melamine', label: '멜라민' },
    { id: 'premium', label: '프리미엄' }
  ];

  const floorOptions = [
    { id: 'yes', label: '있음' },
    { id: 'no', label: '없음' }
  ];

  const frameTypeOptions = [
    { id: 'surround', label: '서라운드' },
    { id: 'no-surround', label: '노서라운드' }
  ];

  return (
    <div className={`${styles.rightPanel} ${isOpen ? styles.open : ''}`}>
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
                  setActiveDroppedCeilingTab(tab.id === 'placement' ? 'main' : 'dropped');
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
              label="브랜드 타입"
              expanded={expandedSections.has('brand')}
              onToggle={() => toggleSection('brand')}
            >
              <div className={styles.brandType}>
                <div className={styles.brandLabel}>싱글 타입</div>
                <div className={styles.brandOptions}>
                  <button className={styles.brandOption}>싱글</button>
                  <button className={styles.brandOption}>듀얼</button>
                </div>
              </div>
            </FormControl>

            {/* 가격 정보 */}
            <FormControl
              label="가격 정보"
              expanded={expandedSections.has('price')}
              onToggle={() => toggleSection('price')}
            >
              <div className={styles.priceInfo}>
                <div className={styles.priceLabel}>현재 가격</div>
                <div className={styles.priceValue}>₩2,580,000</div>
              </div>
            </FormControl>

            {/* 다재 선택 */}
            <FormControl
              label="다재 선택"
              expanded={expandedSections.has('material')}
              onToggle={() => toggleSection('material')}
            >
              <ColorWheel />
              <div className={styles.materialToggle}>
                <div className={styles.materialLabel}>재질 종류</div>
                <ToggleGroup
                  options={materialOptions}
                  selected="white"
                  onChange={() => {}}
                />
              </div>
            </FormControl>

            {/* 공간 설정 */}
            <FormControl
              label="공간 설정"
              expanded={expandedSections.has('space')}
              onToggle={() => toggleSection('space')}
            >
              <NumberInput
                label="전체 폭"
                value={width}
                onChange={(newWidth) => {
                  onWidthChange(newWidth);
                  // width 변경 시 doorCount 범위 체크 및 자동 조정은 useEffect에서 처리
                }}
                min={1000}
                max={8000}
                step={100}
              />
              <NumberInput
                label="높이"
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
                    <span className={styles.zoneLabel}>메인 구간:</span>
                    <span className={styles.zoneValue}>{width - spaceInfo.droppedCeiling.width} mm</span>
                  </div>
                  <div className={styles.zoneInfoItem}>
                    <span className={styles.zoneLabel}>단내림 구간:</span>
                    <span className={styles.zoneValue}>{spaceInfo.droppedCeiling.width} mm</span>
                  </div>
                </div>
              )}
            </FormControl>

            {/* 메인공간 사이즈 - 단내림 활성화되고 메인구간 탭일 때만 표시 */}
            {spaceInfo.droppedCeiling?.enabled && activeTab === 'placement' && (
              <FormControl
                label="메인공간 사이즈"
                expanded={expandedSections.has('mainSpace')}
                onToggle={() => toggleSection('mainSpace')}
              >
                <div className={styles.numberInput}>
                  <div className={styles.inputLabel}>메인구간 폭</div>
                  <div className={styles.inputGroup}>
                    <div className={styles.inputField}>
                      <input
                        type="number"
                        value={width - spaceInfo.droppedCeiling.width}
                        readOnly
                        style={{ color: 'var(--theme-text)', backgroundColor: 'var(--theme-background-tertiary)', cursor: 'not-allowed' }}
                      />
                      <span className={styles.inputUnit}>mm</span>
                    </div>
                  </div>
                </div>
                <div className={styles.numberInput}>
                  <div className={styles.inputLabel}>메인구간 높이</div>
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

            {/* 레이아웃 */}
            <FormControl
              label="레이아웃"
              expanded={expandedSections.has('layout')}
              onToggle={() => toggleSection('layout')}
            >
              <NumberInput
                label={spaceInfo.droppedCeiling?.enabled ? "메인 구간 도어 개수" : "도어 개수"}
                value={doorCount}
                onChange={onDoorCountChange}
                min={minDoors}
                max={maxDoors}
                unit="개"
              />
              
              <DoorSlider
                value={doorCount}
                onChange={onDoorCountChange}
                width={width}
              />


            </FormControl>

            {/* 바닥 마감재 */}
            <FormControl
              label="바닥 마감재"
              expanded={expandedSections.has('floor')}
              onToggle={() => toggleSection('floor')}
            >
              <ToggleGroup
                options={floorOptions}
                selected={hasFloorFinish ? 'yes' : 'no'}
                onChange={(value) => onFloorFinishToggle()}
              />
            </FormControl>

            {/* 프레임 속성 */}
            <FormControl
              label="프레임 속성"
              expanded={expandedSections.has('frame')}
              onToggle={() => toggleSection('frame')}
            >
              <ToggleGroup
                options={frameTypeOptions}
                selected={frameType}
                onChange={(value) => onFrameTypeChange(value as 'surround' | 'no-surround')}
              />
            </FormControl>
          </div>
        )}

        {activeTab === 'module' && (
          <div className={styles.moduleSettings}>
            {/* 단내림 구간이 활성화된 경우 도어 개수 표시 */}
            {spaceInfo.droppedCeiling?.enabled && (
              <div className={styles.formContainer}>
                <FormControl
                  label="단내림 구간 레이아웃"
                  expanded={expandedSections.has('droppedLayout')}
                  onToggle={() => toggleSection('droppedLayout')}
                >
                  <div className={styles.numberInput}>
                    <div className={styles.inputLabel}>단내림 구간 도어 개수</div>
                    <div className={styles.inputGroup}>
                      <div className={styles.inputField}>
                        <input
                          type="number"
                          value={spaceInfo.droppedCeilingDoorCount || 0}
                          readOnly
                          style={{ color: 'var(--theme-text)', backgroundColor: 'var(--theme-background-tertiary)', cursor: 'not-allowed' }}
                        />
                        <span className={styles.inputUnit}>개</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className={styles.zoneInfo} style={{ marginTop: '12px' }}>
                    <div className={styles.zoneInfoItem}>
                      <span className={styles.zoneLabel}>구간 폭:</span>
                      <span className={styles.zoneValue}>{spaceInfo.droppedCeiling.width} mm</span>
                    </div>
                    <div className={styles.zoneInfoItem}>
                      <span className={styles.zoneLabel}>구간 높이:</span>
                      <span className={styles.zoneValue}>{height - spaceInfo.droppedCeiling.dropHeight} mm</span>
                    </div>
                    {spaceInfo.droppedCeilingDoorCount && (
                      <div className={styles.zoneInfoItem}>
                        <span className={styles.zoneLabel}>슬롯 폭:</span>
                        <span className={styles.zoneValue}>
                          {Math.floor((spaceInfo.droppedCeiling.width - 100) / spaceInfo.droppedCeilingDoorCount)} mm
                        </span>
                      </div>
                    )}
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
          완료
        </button>
      </div>
    </div>
  );
};

export { DoorSlider as DoorCountSlider };
export default RightPanel; 