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
    <label className={styles.inputLabel}>{label}</label>
    <div className={styles.inputGroup}>
      <button 
        className={styles.inputButton}
        onClick={() => onChange(Math.max(min || 0, value - step))}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="2"/>
        </svg>
      </button>
      <div className={styles.inputField}>
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          min={min}
          max={max}
          step={step}
        />
        <span className={styles.inputUnit}>{unit}</span>
      </div>
      <button 
        className={styles.inputButton}
        onClick={() => onChange(Math.min(max || Infinity, value + step))}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" strokeWidth="2"/>
          <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="2"/>
        </svg>
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
    new Set(['install', 'space', 'step', 'layout', 'floor', 'frame', 'base'])
  );

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const tabs = [
    { id: 'placement' as RightPanelTab, label: '배치 속성' },
    { id: 'module' as RightPanelTab, label: '모듈 속성' }
  ];

  const installTypes = [
    { id: 'builtin', label: '빌트인' },
    { id: 'semistanding', label: '세미스탠딩' },
    { id: 'freestanding', label: '프리스탠딩' }
  ];

  const stepOptions = [
    { id: 'yes', label: '있음' },
    { id: 'no', label: '없음' }
  ];

  const floorOptions = [
    { id: 'yes', label: '있음' },
    { id: 'no', label: '없음' }
  ];

  const baseOptions = [
    { id: 'yes', label: '있음' },
    { id: 'no', label: '없음' }
  ];

  // 사용하지 않는 매개변수 (TypeScript 경고 방지)

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
            {/* 설치 타입 */}
            <FormControl
              label="설치 타입"
              expanded={expandedSections.has('install')}
              onToggle={() => toggleSection('install')}
            >
              <ToggleGroup
                options={installTypes}
                selected={installType}
                onChange={onInstallTypeChange}
              />
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
                onChange={onWidthChange}
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

            {/* 단내림 */}
            <FormControl
              label="단내림"
              expanded={expandedSections.has('step')}
              onToggle={() => toggleSection('step')}
            >
              <ToggleGroup
                options={stepOptions}
                selected={hasStep ? 'yes' : 'no'}
                onChange={(value) => onStepToggle()}
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
                min={2}
                max={15}
                unit="개"
              />
              
              {/* 도어 슬라이더 */}
              <div className={styles.doorSlider}>
                <div className={styles.sliderTrack}>
                  {Array.from({ length: 8 }, (_, i) => (
                    <div
                      key={i}
                      className={`${styles.sliderDivider} ${i === 0 ? styles.active : ''}`}
                    />
                  ))}
                  <div className={styles.sliderHandle}></div>
                </div>
                <div className={styles.sliderLabels}>
                  {[8, 9, 10, 11, 12, 13, 14, 15].map((num) => (
                    <span key={num} className={num === 8 ? styles.active : ''}>
                      {num}
                    </span>
                  ))}
                </div>
              </div>

              <div className={styles.infoBox}>
                <p>현 사이즈 기준 슬롯 생성 범위: 최소 8개 ~ 최대 15개</p>
                <p>도어 1개 너비: 588mm</p>
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

            {/* 프레임 속성 */}
            <FormControl
              label="프레임 속성"
              expanded={expandedSections.has('frame')}
              onToggle={() => toggleSection('frame')}
            >
              <div className={styles.placeholder}>프레임 속성 설정</div>
            </FormControl>

            {/* 받침대 */}
            <FormControl
              label="받침대"
              expanded={expandedSections.has('base')}
              onToggle={() => toggleSection('base')}
            >
              <ToggleGroup
                options={baseOptions}
                selected={hasBase ? 'yes' : 'no'}
                onChange={(value) => onBaseToggle()}
              />
              
              {hasBase && (
                <div className={styles.baseSettings}>
                  <h4 className={styles.subsectionTitle}>받침대 설정</h4>
                  <NumberInput
                    label="높이"
                    value={baseHeight}
                    onChange={onBaseHeightChange}
                    min={50}
                    max={200}
                    step={10}
                  />
                  <NumberInput
                    label="깊이"
                    value={baseDepth}
                    onChange={onBaseDepthChange}
                    min={400}
                    max={800}
                    step={10}
                  />
                </div>
              )}
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