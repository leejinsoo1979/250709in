import React, { useState, useRef, useEffect } from 'react';
import { useProjectStore } from '@/store/core/projectStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import Input from '@/components/common/Input';
import styles from './Step1BasicInfo.module.css';

interface Step1BasicInfoProps {
  onNext: () => void;
  onClose: () => void;
}

const Step1BasicInfo: React.FC<Step1BasicInfoProps> = ({ onNext, onClose }) => {
  const { basicInfo, setBasicInfo } = useProjectStore();
  const { spaceInfo, setSpaceInfo } = useSpaceConfigStore();
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [hasFloorFinish, setHasFloorFinish] = useState(spaceInfo.hasFloorFinish || false);
  const [floorFinishHeight, setFloorFinishHeight] = useState(spaceInfo.floorFinish?.height || 10);
  
  const locationOptions = ['안방', '거실', '아이방', '옷방', '창고'];

  const canProceed = basicInfo.title && basicInfo.title.trim() && basicInfo.location && basicInfo.location.trim();

  const handleUpdate = (updates: Partial<typeof basicInfo>) => {
    setBasicInfo({ ...basicInfo, ...updates });
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLocationSelect = (location: string) => {
    handleUpdate({ location });
    setShowDropdown(false);
  };

  const handleFloorFinishToggle = () => {
    const newHasFloorFinish = !hasFloorFinish;
    setHasFloorFinish(newHasFloorFinish);
    setSpaceInfo({
      ...spaceInfo,
      hasFloorFinish: newHasFloorFinish,
      floorFinish: newHasFloorFinish ? {
        type: 'wood',
        thickness: 5,
        height: floorFinishHeight
      } : null
    });
  };

  const handleFloorFinishHeightChange = (height: number) => {
    setFloorFinishHeight(height);
    if (hasFloorFinish) {
      setSpaceInfo({
        ...spaceInfo,
        floorFinish: {
          type: 'wood',
          thickness: 5,
          height: height
        }
      });
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.modalContent}>
        <div className={styles.header}>
          <button
            className={styles.closeButton}
            aria-label="닫기"
            onClick={onClose}
          >
            ×
          </button>
          <div>
            <h1>STEP. 1 기본 정보</h1>
            <p>디자인 정보를 입력해주세요.</p>
          </div>
        </div>

        <div className={styles.content}>
          <div className={styles.leftSection}>
            <div className={styles.iconContainer}>
              <div className={styles.stepIcon}>
                <svg width="120" height="120" viewBox="0 0 120 120" fill="none" className={styles.stepIconSvg}>
                  <circle cx="60" cy="60" r="60" className={styles.iconBackground}/>
                  <rect x="30" y="35" width="60" height="50" rx="4" className={styles.iconPaper}/>
                  <rect x="35" y="45" width="30" height="2" className={styles.iconAccent}/>
                  <rect x="35" y="50" width="40" height="2" className={styles.iconAccent}/>
                  <rect x="35" y="55" width="25" height="2" className={styles.iconAccent}/>
                  <rect x="35" y="65" width="35" height="2" className={styles.iconAccent}/>
                  <rect x="35" y="70" width="20" height="2" className={styles.iconAccent}/>
                  <circle cx="75" cy="65" r="8" className={styles.iconAccent}/>
                  <path d="M71 65l2 2 4-4" stroke="white" strokeWidth="2" fill="none"/>
                  <rect x="82" y="40" width="8" height="25" rx="1" className={styles.iconPaper}/>
                  <rect x="84" y="35" width="4" height="8" rx="2" className={styles.iconPaper}/>
                </svg>
              </div>
              <div className={styles.stepInfo}>
                <span className={styles.stepNumber}>1 단계 / 3</span>
              </div>
            </div>
          </div>

          <div className={styles.rightSection}>
            <div className={styles.formSection}>
              <h2>정보</h2>
              <div className={styles.form}>
                <div className={styles.inputGroup}>
                  <label className={styles.fieldLabel}>
                    {basicInfo.title && basicInfo.title.trim() && (
                      <span className={styles.checkIcon}>✓</span>
                    )}
                    디자인 제목
                  </label>
                  <Input
                    placeholder="디자인 제목을 입력해주세요"
                    value={basicInfo.title || ''}
                    onChange={(e) => handleUpdate({ title: e.target.value })}
                    fullWidth
                    size="medium"
                  />
                </div>
                
                <div className={styles.inputGroup}>
                  <label className={styles.fieldLabel}>
                    {basicInfo.location && basicInfo.location.trim() && (
                      <span className={styles.checkIcon}>✓</span>
                    )}
                    설치 위치
                  </label>
                  <div className={styles.inputWrapper} ref={dropdownRef}>
                    <Input
                      placeholder="설치 위치를 선택하거나 입력해주세요"
                      value={basicInfo.location || ''}
                      onChange={(e) => handleUpdate({ location: e.target.value })}
                      onFocus={() => setShowDropdown(true)}
                      fullWidth
                      size="medium"
                    />
                    <button
                      type="button"
                      className={styles.dropdownToggle}
                      onClick={() => setShowDropdown(!showDropdown)}
                    >
                      <svg width="12" height="8" viewBox="0 0 12 8" fill="none">
                        <path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                    {showDropdown && (
                      <div className={styles.dropdown}>
                        {locationOptions.map((option) => (
                          <button
                            key={option}
                            className={styles.dropdownOption}
                            onClick={() => handleLocationSelect(option)}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className={styles.inputGroup}>
                  <label className={styles.fieldLabel}>
                    바닥 마감재
                  </label>
                  <div className={styles.toggleSection}>
                    <div className={styles.toggleButtons}>
                      <button
                        type="button"
                        className={`${styles.toggleButton} ${!hasFloorFinish ? styles.active : ''}`}
                        onClick={() => hasFloorFinish && handleFloorFinishToggle()}
                      >
                        없음
                      </button>
                      <button
                        type="button"
                        className={`${styles.toggleButton} ${hasFloorFinish ? styles.active : ''}`}
                        onClick={() => !hasFloorFinish && handleFloorFinishToggle()}
                      >
                        있음
                      </button>
                    </div>
                    
                    {hasFloorFinish && (
                      <div className={styles.subOption}>
                        <label className={styles.subLabel}>높이</label>
                        <div className={styles.heightInput}>
                          <input
                            type="number"
                            value={floorFinishHeight}
                            onChange={(e) => handleFloorFinishHeightChange(parseInt(e.target.value) || 10)}
                            min="5"
                            max="50"
                            className={styles.numberInput}
                          />
                          <span className={styles.unit}>mm</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <button
            className={styles.nextButton}
            onClick={onNext}
            disabled={!canProceed}
          >
            다음 단계
          </button>
        </div>
      </div>
    </div>
  );
};

export default Step1BasicInfo;