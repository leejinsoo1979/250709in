import React from 'react';
import { ImCreditCard } from "react-icons/im";
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
            <ImCreditCard className={creditStyles.cardIcon} />
          </div>
          <h2 className={creditStyles.modalTitle}>무료 크레딧이 모두 소진되었습니다</h2>
          <p className={creditStyles.modalDescription}>
            현재 <strong>Free 플랜</strong>을 사용 중이며, 제공된 무료 크레딧을 모두 사용하셨습니다.
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

        <div className={creditStyles.upgradeBox}>
          <div className={creditStyles.upgradeHeader}>
            <svg className={creditStyles.crownIcon} width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L15 8L22 9L17 14L18 21L12 18L6 21L7 14L2 9L9 8L12 2Z" fill="currentColor"/>
            </svg>
            <span className={creditStyles.upgradeTitle}>Pro 플랜으로 업그레이드하세요</span>
          </div>
          <ul className={creditStyles.benefitList}>
            <li>✓ 매월 1,000 크레딧 자동 충전</li>
            <li>✓ 무제한 디자인 파일 생성</li>
            <li>✓ 프리미엄 템플릿 무료 이용</li>
            <li>✓ 우선 고객 지원</li>
          </ul>
        </div>

        <div className={creditStyles.modalFooter}>
          <button className={creditStyles.cancelBtn} onClick={onClose}>
            나중에 하기
          </button>
          <button className={creditStyles.upgradeBtn} onClick={handleRecharge}>
            Pro 플랜 구독하기
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreditErrorModal;
