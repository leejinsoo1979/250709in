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
        <button className={creditStyles.closeButton} onClick={onClose}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>

        <div className={creditStyles.modalLayout}>
          {/* 왼쪽 패널 */}
          <div className={creditStyles.leftPanel}>
            <div className={creditStyles.currentPlanCard}>
              <div className={creditStyles.planBadge}>
                <ImCreditCard className={creditStyles.badgeIcon} />
                <span>현재 플랜</span>
              </div>
              <h2 className={creditStyles.planTitle}>Free 플랜</h2>
              <p className={creditStyles.planSubtitle}>무료 크레딧이 모두 소진되었습니다</p>

              <div className={creditStyles.creditStatus}>
                <div className={creditStyles.creditRow}>
                  <span className={creditStyles.creditLabel}>보유 크레딧</span>
                  <span className={creditStyles.creditValue}>{currentCredits}</span>
                </div>
                <div className={creditStyles.creditRow}>
                  <span className={creditStyles.creditLabel}>필요 크레딧</span>
                  <span className={creditStyles.creditValue}>{requiredCredits}</span>
                </div>
                <div className={creditStyles.dividerLine}></div>
                <div className={creditStyles.creditRow}>
                  <span className={creditStyles.creditLabelBold}>부족한 크레딧</span>
                  <span className={creditStyles.creditValueBold}>
                    {Math.max(0, requiredCredits - currentCredits)}
                  </span>
                </div>
              </div>

              <div className={creditStyles.upgradeInfo}>
                <p className={creditStyles.upgradeText}>
                  Pro 플랜으로 업그레이드하면<br/>
                  <strong>매월 1,000 크레딧</strong>을 자동으로 받을 수 있습니다
                </p>
              </div>
            </div>
          </div>

          {/* 오른쪽 패널 - 플랜 비교 테이블 */}
          <div className={creditStyles.rightPanel}>
            <h3 className={creditStyles.comparisonTitle}>플랜 혜택 비교</h3>

            <div className={creditStyles.comparisonTable}>
              <div className={creditStyles.tableHeader}>
                <div className={creditStyles.featureCol}>혜택</div>
                <div className={creditStyles.planCol}>Free</div>
                <div className={`${creditStyles.planCol} ${creditStyles.proPlanCol}`}>Pro</div>
              </div>

              <div className={creditStyles.tableBody}>
                <div className={creditStyles.tableRow}>
                  <div className={creditStyles.featureCell}>월간 크레딧</div>
                  <div className={creditStyles.valueCell}>100</div>
                  <div className={`${creditStyles.valueCell} ${creditStyles.proValue}`}>1,000</div>
                </div>

                <div className={creditStyles.tableRow}>
                  <div className={creditStyles.featureCell}>디자인 파일 생성</div>
                  <div className={creditStyles.valueCell}>제한적</div>
                  <div className={`${creditStyles.valueCell} ${creditStyles.proValue}`}>무제한</div>
                </div>

                <div className={creditStyles.tableRow}>
                  <div className={creditStyles.featureCell}>프리미엄 템플릿</div>
                  <div className={creditStyles.valueCell}>—</div>
                  <div className={`${creditStyles.valueCell} ${creditStyles.proValue}`}>✓</div>
                </div>

                <div className={creditStyles.tableRow}>
                  <div className={creditStyles.featureCell}>클라우드 저장공간</div>
                  <div className={creditStyles.valueCell}>5GB</div>
                  <div className={`${creditStyles.valueCell} ${creditStyles.proValue}`}>100GB</div>
                </div>

                <div className={creditStyles.tableRow}>
                  <div className={creditStyles.featureCell}>우선 고객 지원</div>
                  <div className={creditStyles.valueCell}>—</div>
                  <div className={`${creditStyles.valueCell} ${creditStyles.proValue}`}>✓</div>
                </div>

                <div className={creditStyles.tableRow}>
                  <div className={creditStyles.featureCell}>팀 협업 기능</div>
                  <div className={creditStyles.valueCell}>—</div>
                  <div className={`${creditStyles.valueCell} ${creditStyles.proValue}`}>✓</div>
                </div>
              </div>
            </div>

            <div className={creditStyles.priceSection}>
              <div className={creditStyles.priceTag}>
                <span className={creditStyles.currency}>₩</span>
                <span className={creditStyles.price}>29,000</span>
                <span className={creditStyles.period}>/월</span>
              </div>
              <button className={creditStyles.upgradeButton} onClick={handleRecharge}>
                Pro 플랜 시작하기
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreditErrorModal;
