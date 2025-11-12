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
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>크레딧 부족</h3>
        </div>

        <div className={styles.content}>
          <p className={styles.message}>
            새로운 디자인 파일을 생성하려면 추가 크레딧이 필요합니다.
          </p>

          <div className={creditStyles.creditInfo}>
            <div className={creditStyles.creditRow}>
              <span className={creditStyles.label}>보유 크레딧</span>
              <span className={creditStyles.value}>{currentCredits.toLocaleString()}점</span>
            </div>
            <div className={creditStyles.creditRow}>
              <span className={creditStyles.label}>필요 크레딧</span>
              <span className={`${creditStyles.value} ${creditStyles.required}`}>{requiredCredits.toLocaleString()}점</span>
            </div>
            <div className={creditStyles.divider}></div>
            <div className={creditStyles.creditRow}>
              <span className={creditStyles.label}>부족 크레딧</span>
              <span className={`${creditStyles.value} ${creditStyles.shortage}`}>
                {Math.max(0, requiredCredits - currentCredits).toLocaleString()}점
              </span>
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelButton} onClick={onClose}>
            취소
          </button>
          <button className={creditStyles.rechargeButton} onClick={handleRecharge}>
            크레딧 충전하기
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreditErrorModal;
