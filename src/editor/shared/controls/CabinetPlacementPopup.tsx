import React, { useState } from 'react';
import { CabinetPlacementOption } from '@/editor/shared/utils/columnSlotProcessor';
import styles from './CabinetPlacementPopup.module.css';

interface CabinetPlacementPopupProps {
  options: CabinetPlacementOption[];
  onSelect: (option: CabinetPlacementOption) => void;
  onCancel: () => void;
  position: { x: number; y: number }; // 마우스 위치
  columnDepth: number;
}

const CabinetPlacementPopup: React.FC<CabinetPlacementPopupProps> = ({
  options,
  onSelect,
  onCancel,
  position,
  columnDepth
}) => {
  const [selectedOption, setSelectedOption] = useState<CabinetPlacementOption | null>(null);

  const handleSelect = () => {
    if (selectedOption) {
      onSelect(selectedOption);
    }
  };

  const getOptionIcon = (type: string) => {
    switch (type) {
      case 'single':
        return '📦';
      case 'split-weighted':
        return '📊';
      case 'split-equal':
        return '⚖️';
      default:
        return '📋';
    }
  };

  return (
    <div 
      className={styles.popup}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`
      }}
    >
      <div className={styles.header}>
        <h3>캐비넷 배치 선택</h3>
        <p>기둥 깊이: {columnDepth}mm (얕은 기둥)</p>
      </div>
      
      <div className={styles.optionsList}>
        {options.map((option, index) => (
          <div 
            key={index}
            className={`${styles.option} ${selectedOption === option ? styles.selected : ''}`}
            onClick={() => setSelectedOption(option)}
          >
            <div className={styles.optionHeader}>
              <span className={styles.icon}>{getOptionIcon(option.type)}</span>
              <span className={styles.label}>{option.label}</span>
            </div>
            <p className={styles.description}>{option.description}</p>
            
            <div className={styles.cabinetPreview}>
              {option.cabinets.map((cabinet, cabinetIndex) => (
                <div key={cabinetIndex} className={styles.cabinetInfo}>
                  <span>캐비넷 {cabinetIndex + 1}:</span>
                  <span>폭 {cabinet.width.toFixed(0)}mm</span>
                  <span>깊이 {cabinet.depth}mm</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      
      <div className={styles.actions}>
        <button 
          className={styles.cancelButton}
          onClick={onCancel}
        >
          취소
        </button>
        <button 
          className={styles.confirmButton}
          onClick={handleSelect}
          disabled={!selectedOption}
        >
          선택
        </button>
      </div>
    </div>
  );
};

export default CabinetPlacementPopup;