import React from 'react';
import { useProjectStore } from '@/store/core/projectStore';
import Input from '@/components/common/Input';
import styles from './Step1BasicInfo.module.css';

interface Step1BasicInfoProps {
  onNext: () => void;
  onClose: () => void;
}

const Step1BasicInfo: React.FC<Step1BasicInfoProps> = ({ onNext, onClose }) => {
  const { basicInfo, setBasicInfo } = useProjectStore();

  const canProceed = basicInfo.title && basicInfo.title.trim() && basicInfo.location && basicInfo.location.trim();

  const handleUpdate = (updates: Partial<typeof basicInfo>) => {
    setBasicInfo({ ...basicInfo, ...updates });
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
                  <Input
                    placeholder="설치 위치를 입력해주세요 (예: 안방, 작은방, 거실, 기타)"
                    value={basicInfo.location || ''}
                    onChange={(e) => handleUpdate({ location: e.target.value })}
                    fullWidth
                    size="medium"
                  />
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