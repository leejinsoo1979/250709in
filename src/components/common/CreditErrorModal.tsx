import React from 'react';
import styles from './AlertModal.module.css';
import creditStyles from './CreditErrorModal.module.css';

interface CreditErrorModalProps {
  isOpen: boolean;
  currentCredits: number;
  requiredCredits: number;
  onClose: () => void;
  onRecharge?: () => void;
}

const CreditErrorModal: React.FC<CreditErrorModalProps> = ({
  isOpen,
  currentCredits,
  requiredCredits,
  onClose,
  onRecharge
}) => {
  if (!isOpen) return null;

  const handleRecharge = () => {
    if (onRecharge) {
      onRecharge();
    } else {
      // 기본 동작: 프로필 팝업으로 이동
      window.dispatchEvent(new CustomEvent('openProfilePopup'));
    }
    onClose();
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={`${styles.modal} ${creditStyles.creditModal}`} onClick={(e) => e.stopPropagation()}>
        <div className={creditStyles.modalHeader}>
          <div className={creditStyles.iconWrapper}>
            <svg className={creditStyles.warningIcon} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
              <path d="M12 8V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="12" cy="16" r="1" fill="currentColor"/>
            </svg>
          </div>
          <h2 className={creditStyles.modalTitle}>크레딧이 부족합니다</h2>
          <p className={creditStyles.modalDescription}>
            디자인 파일을 생성하려면 크레딧이 필요합니다.<br/>
            크레딧을 충전하신 후 다시 시도해주세요.
          </p>
        </div>

        <div className={creditStyles.creditInfoBox}>
          <div className={creditStyles.creditDetail}>
            <div className={creditStyles.creditLabel}>현재 보유</div>
            <div className={creditStyles.creditAmount}>
              <span className={creditStyles.creditNumber}>{currentCredits.toLocaleString()}</span>
              <span className={creditStyles.creditUnit}>크레딧</span>
            </div>
          </div>

          <div className={creditStyles.creditDivider}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>

          <div className={creditStyles.creditDetail}>
            <div className={creditStyles.creditLabel}>필요한 양</div>
            <div className={creditStyles.creditAmount}>
              <span className={creditStyles.creditNumber}>{requiredCredits.toLocaleString()}</span>
              <span className={creditStyles.creditUnit}>크레딧</span>
            </div>
          </div>
        </div>

        <div className={creditStyles.shortageBox}>
          <span className={creditStyles.shortageLabel}>부족한 크레딧</span>
          <span className={creditStyles.shortageAmount}>
            {Math.max(0, requiredCredits - currentCredits).toLocaleString()} 크레딧
          </span>
        </div>

        <div className={creditStyles.modalFooter}>
          <button className={creditStyles.cancelBtn} onClick={onClose}>
            취소
          </button>
          <button className={creditStyles.rechargeBtn} onClick={handleRecharge}>
            크레딧 충전하기
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreditErrorModal;
