import React from 'react';
import styles from './Header.module.css';
import { Settings } from 'lucide-react';

interface HeaderProps {
  title: string;
  onSave: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onHelp?: () => void;
  onConvert?: () => void;
  onLogout?: () => void;
  onProfile?: () => void;
  saving?: boolean;
  saveStatus?: 'idle' | 'success' | 'error';
  // 도어 설치 관련 props 추가
  hasDoorsInstalled?: boolean;
  onDoorInstallationToggle?: () => void;
}

const Header: React.FC<HeaderProps> = ({
  title,
  onSave,
  onPrevious,
  onNext,
  onHelp,
  onConvert,
  onLogout,
  onProfile,
  saving = false,
  saveStatus = 'idle',
  hasDoorsInstalled = false,
  onDoorInstallationToggle
}) => {
  return (
    <header className={styles.header}>
      <div className={styles.container}>
        {/* 로고 영역 */}
        <div className={styles.logoSection}>
          <div className={styles.logo}>
            <img src="/inshow.svg" alt="Logo" />
          </div>
          <h1 className={styles.title}>{title}</h1>
        </div>

        {/* 중앙 액션 버튼들 */}
        <div className={styles.centerActions}>
          <button 
            className={styles.actionButton}
            onClick={onSave}
            disabled={saving}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" stroke="currentColor" strokeWidth="2"/>
              <polyline points="17,21 17,13 7,13 7,21" stroke="currentColor" strokeWidth="2"/>
              <polyline points="7,3 7,8 15,8" stroke="currentColor" strokeWidth="2"/>
            </svg>
            {saving ? '저장 중...' : '저장'}
          </button>

          {/* 토글식 도어 설치 버튼 */}
          {onDoorInstallationToggle && (
            <button 
              className={`${styles.actionButton} ${hasDoorsInstalled ? styles.doorInstalled : styles.doorNotInstalled}`}
              onClick={onDoorInstallationToggle}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/>
                <circle cx="9" cy="12" r="1" fill="currentColor"/>
                {hasDoorsInstalled && (
                  <path d="M8 12l2 2 4-4" stroke="currentColor" strokeWidth="2" fill="none"/>
                )}
              </svg>
              도어설치
            </button>
          )}

          {onPrevious && (
            <button className={styles.actionButton} onClick={onPrevious}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <polyline points="15,18 9,12 15,6" stroke="currentColor" strokeWidth="2"/>
              </svg>
              이전
            </button>
          )}

          {onNext && (
            <button className={styles.actionButton} onClick={onNext}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <polyline points="9,18 15,12 9,6" stroke="currentColor" strokeWidth="2"/>
              </svg>
              다음
            </button>
          )}

          {onHelp && (
            <button className={styles.actionButton} onClick={onHelp}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                <path d="m9,9a3,3 0 1 1 5.83,1c0,2-3,3-3,3" stroke="currentColor" strokeWidth="2"/>
                <circle cx="12" cy="17" r="1" fill="currentColor"/>
              </svg>
              도움말
            </button>
          )}
        </div>

        {/* 우측 액션 버튼들 */}
        <div className={styles.rightActions}>
          {onConvert && (
            <button className={styles.convertButton} onClick={onConvert}>
              컨버팅
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <polyline points="9,18 15,12 9,6" stroke="currentColor" strokeWidth="2"/>
              </svg>
            </button>
          )}

          {onLogout && (
            <button className={styles.logoutButton} onClick={onLogout}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="2"/>
                <polyline points="16,17 21,12 16,7" stroke="currentColor" strokeWidth="2"/>
                <line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="2"/>
              </svg>
              로그아웃
            </button>
          )}

          {onProfile && (
            <button className={styles.profileButton} onClick={onProfile}>
              <Settings width="20" height="20" />
            </button>
          )}
        </div>
      </div>

      {/* 저장 상태 표시 */}
      {saveStatus === 'success' && (
        <div className={styles.saveSuccess}>
          ✓ 저장되었습니다
        </div>
      )}
      {saveStatus === 'error' && (
        <div className={styles.saveError}>
          ✕ 저장에 실패했습니다
        </div>
      )}
    </header>
  );
};

export default Header; 