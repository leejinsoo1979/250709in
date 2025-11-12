import React from 'react';
import styles from './CreditErrorModal.module.css';

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
        <div className={styles.iconContainer}>
          <div className={styles.icon}>💳</div>
        </div>

        <div className={styles.content}>
          <h2 className={styles.title}>크레딧이 부족합니다</h2>
          <p className={styles.description}>
            새로운 디자인 파일을 생성하려면 추가 크레딧이 필요합니다.
          </p>

          <div className={styles.creditInfo}>
            <div className={styles.creditRow}>
              <span className={styles.label}>보유 크레딧</span>
              <span className={styles.value}>{currentCredits.toLocaleString()}점</span>
            </div>
            <div className={styles.creditRow}>
              <span className={styles.label}>필요 크레딧</span>
              <span className={styles.value + ' ' + styles.required}>{requiredCredits.toLocaleString()}점</span>
            </div>
            <div className={styles.divider}></div>
            <div className={styles.creditRow}>
              <span className={styles.label}>부족 크레딧</span>
              <span className={styles.value + ' ' + styles.shortage}>
                {Math.max(0, requiredCredits - currentCredits).toLocaleString()}점
              </span>
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelButton} onClick={onClose}>
            취소
          </button>
          <button className={styles.rechargeButton} onClick={handleRecharge}>
            💰 크레딧 충전하기
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreditErrorModal;
