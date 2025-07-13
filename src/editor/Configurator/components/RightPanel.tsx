import React, { useState } from 'react';
import styles from './RightPanel.module.css';

export type RightPanelTab = 'placement' | 'module';

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
  
  // 도어 1개 너비 (588mm)
  const DOOR_WIDTH = 588;
  
  // 공간 넓이 기반 최소/최대 도어 개수 계산
  const calculateDoorRange = (spaceWidth: number) => {
    // 양쪽 여백 고려 (프레임 등)
    const FRAME_MARGIN = 100; // 양쪽 50mm씩
    const usableWidth = spaceWidth - FRAME_MARGIN;
    
    // 슬롯 크기 제약 조건 (400mm ~ 600mm)
    const MIN_SLOT_WIDTH = 400;
    const MAX_SLOT_WIDTH = 600;
    
    // 실제 설치 가능한 최소/최대 도어 개수 계산
    const minPossible = Math.max(1, Math.floor(usableWidth / MAX_SLOT_WIDTH)); // 슬롯 최대 600mm
    const maxPossible = Math.min(20, Math.floor(usableWidth / MIN_SLOT_WIDTH)); // 슬롯 최소 400mm
    
    // 이상적인 도어 개수 (588mm 기준)
    const idealDoorCount = Math.round(usableWidth / DOOR_WIDTH);
    
    return {
      min: minPossible,
      max: maxPossible,
      ideal: idealDoorCount
    };
  };
  
  const doorRange = calculateDoorRange(width);
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
    setIsDragging(true);
    handleMouseMove(e);
  };
  
  const handleMouseMove = (e: React.MouseEvent | MouseEvent) => {
    if (!isDragging && e.type !== 'mousedown') return;
    
    const rect = (e.currentTarget as HTMLElement)?.getBoundingClientRect() || 
                 (e.target as HTMLElement)?.closest(`.${styles.sliderTrack}`)?.getBoundingClientRect();
    
    if (!rect) return;
    
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
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging]);
  
  // 값이 범위를 벗어나면 자동 조정
  React.useEffect(() => {
    if (clampedValue !== value) {
      onChange(clampedValue);
    }
  }, [clampedValue, value, onChange]);

  // width 변경 시 현재 값이 새로운 범위를 벗어나면 자동 조정
  React.useEffect(() => {
    const range = calculateDoorRange(width);
    if (value < range.min || value > range.max) {
      const newValue = Math.max(range.min, Math.min(range.max, value));
      onChange(newValue);
    }
  }, [width, value, onChange]);
  
  // 슬라이더 라벨 생성 (동적)
  const generateLabels = () => {
    const doorCount = maxDoors - minDoors + 1;
    
    if (doorCount <= 8) {
      // 도어 개수가 8개 이하면 모든 값 표시
      const labels = [];
      for (let i = minDoors; i <= maxDoors; i++) {
        labels.push(i);
      }
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
      return labels;
    }
  };
  
  const labels = generateLabels();
  const sliderPosition = getSliderPosition(clampedValue);
  
  return (
    <div className={styles.doorSlider}>
      <div 
        className={styles.sliderTrack}
        onMouseDown={handleMouseDown}
      >
        {/* 슬라이더 구간 표시 */}
        {labels.map((_, index) => {
          const isActive = index <= labels.findIndex(l => l >= clampedValue);
          return (
            <div
              key={index}
              className={`${styles.sliderDivider} ${isActive ? styles.active : ''}`}
            />
          );
        })}
        
        {/* 슬라이더 핸들 */}
        <div 
          className={styles.sliderHandle}
          style={{ left: `${sliderPosition}%` }}
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
      
      {/* 디버그 정보 (개발용) */}
      <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '4px' }}>
        현재: {clampedValue}개, 범위: {minDoors}-{maxDoors}개 (슬롯 400-600mm 제약)
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
  onBaseDepthChange
}) => {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['brand', 'price', 'material', 'space', 'layout', 'floor', 'frame'])
  );

  // 도어 개수 범위 계산
  const DOOR_WIDTH = 588;
  
  const calculateDoorRange = (spaceWidth: number) => {
    // 양쪽 여백 고려 (프레임 등)
    const FRAME_MARGIN = 100; // 양쪽 50mm씩
    const usableWidth = spaceWidth - FRAME_MARGIN;
    
    // 슬롯 크기 제약 조건 (400mm ~ 600mm)
    const MIN_SLOT_WIDTH = 400;
    const MAX_SLOT_WIDTH = 600;
    
    // 실제 설치 가능한 최소/최대 도어 개수 계산
    const minPossible = Math.max(1, Math.floor(usableWidth / MAX_SLOT_WIDTH)); // 슬롯 최대 600mm
    const maxPossible = Math.min(20, Math.floor(usableWidth / MIN_SLOT_WIDTH)); // 슬롯 최소 400mm
    
    // 이상적인 도어 개수 (588mm 기준)
    const idealDoorCount = Math.round(usableWidth / DOOR_WIDTH);
    
    return {
      min: minPossible,
      max: maxPossible,
      ideal: idealDoorCount
    };
  };

  // width 변경 시 doorCount 자동 조정
  React.useEffect(() => {
    const range = calculateDoorRange(width);
    if (doorCount < range.min || doorCount > range.max) {
      // 현재 doorCount가 새로운 범위를 벗어나면 가장 가까운 유효한 값으로 조정
      const newDoorCount = Math.max(range.min, Math.min(range.max, doorCount));
      onDoorCountChange(newDoorCount);
    }
  }, [width, doorCount, onDoorCountChange]);

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };


  
  const doorRange = calculateDoorRange(width);
  const minDoors = doorRange.min;
  const maxDoors = doorRange.max;

  const tabs = [
    { id: 'placement' as RightPanelTab, label: '배치 속성' },
    { id: 'module' as RightPanelTab, label: '모듈 속성' }
  ];

  const installTypes = [
    { id: 'builtin', label: '빌트인' },
    { id: 'semistanding', label: '세미스탠딩' },
    { id: 'freestanding', label: '프리스탠딩' }
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

  return (
    <div className={`${styles.rightPanel} ${isOpen ? styles.open : ''}`}>
      {/* 탭 헤더 */}
      <div className={styles.tabHeader}>
        <div className={styles.tabGroup}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`${styles.tabButton} ${activeTab === tab.id ? styles.active : ''}`}
              onClick={() => onTabChange(tab.id)}
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
                label="폭"
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
            </FormControl>

            {/* 레이아웃 */}
            <FormControl
              label="레이아웃"
              expanded={expandedSections.has('layout')}
              onToggle={() => toggleSection('layout')}
            >
              <NumberInput
                label="도어 개수"
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

                              <div className={styles.infoBox}>
                  <p>현재 배치된 슬롯: {doorCount}개</p>
                  <p>슬롯 크기 제약: 400mm ~ 600mm</p>
                  <p>공간 기준 조정 범위: {minDoors}개 ~ {maxDoors}개</p>
                  <p>현재 공간 넓이: {width}mm (사용 가능: {width - 100}mm)</p>
                </div>

              {/* 슬롯 내경 정보 */}
              <div className={styles.slotInnerDimensions}>
                <div className={styles.slotLabel}>현재 슬롯 내경</div>
                <div className={styles.slotValue}>
                  {(() => {
                    // 프레임 마진 (양쪽 50mm씩)
                    const FRAME_MARGIN = 100;
                    // 도어 프레임 두께 (각 도어당 양쪽 2mm씩)
                    const DOOR_FRAME_THICKNESS = 4;
                    
                    // 실제 사용 가능한 너비 계산
                    const usableWidth = width - FRAME_MARGIN;
                    const slotWidth = usableWidth / doorCount;
                    const innerWidth = slotWidth - DOOR_FRAME_THICKNESS;
                    
                    return Math.round(Math.max(0, innerWidth));
                  })()}mm
                </div>
                <div className={styles.slotInfo}>
                  (슬롯 {doorCount}개 기준 · 프레임 여백 제외)
                </div>
                <div className={`${styles.slotDetails} ${(() => {
                  const usableWidth = width - 100;
                  const slotWidth = usableWidth / doorCount;
                  const innerWidth = slotWidth - 4;
                  
                  if (innerWidth < 400 || innerWidth > 600) {
                    return styles.slotWarning;
                  }
                  return '';
                })()}`}>
                  <div>• 전체 공간: {width}mm</div>
                  <div>• 사용 가능: {width - 100}mm</div>
                  <div>• 슬롯당 할당: {Math.round((width - 100) / doorCount)}mm</div>
                  {(() => {
                    const usableWidth = width - 100;
                    const slotWidth = usableWidth / doorCount;
                    const innerWidth = slotWidth - 4;
                    
                    if (innerWidth < 400) {
                      return <div className={styles.warningText}>⚠️ 슬롯이 너무 작습니다 (최소 400mm 필요)</div>;
                    } else if (innerWidth > 600) {
                      return <div className={styles.warningText}>⚠️ 슬롯이 너무 큽니다 (최대 600mm 권장)</div>;
                    }
                    return <div className={styles.successText}>✓ 슬롯 크기가 적절합니다</div>;
                  })()}
                </div>
              </div>
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

            {/* 프레임 색상 */}
            <FormControl
              label="프레임 색상"
              expanded={expandedSections.has('frame')}
              onToggle={() => toggleSection('frame')}
            >
              <div className={styles.frameColor}>
                <div className={styles.frameColorOption}>
                  <div className={styles.frameColorSwatch} style={{ backgroundColor: '#000000' }}></div>
                  <span>블랙</span>
                </div>
                <div className={styles.frameColorOption}>
                  <div className={styles.frameColorSwatch} style={{ backgroundColor: '#ffffff' }}></div>
                  <span>화이트</span>
                </div>
              </div>
            </FormControl>
          </div>
        )}

        {activeTab === 'module' && (
          <div className={styles.moduleSettings}>
            <div className={styles.placeholder}>모듈 속성 설정이 여기에 표시됩니다</div>
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

export default RightPanel; 