import React, { useState, useEffect, useRef } from 'react';
import styles from './Header.module.css';
import { Settings, Menu, User } from 'lucide-react';
import HelpModal from './HelpModal';
import SettingsPanel from '@/components/common/SettingsPanel';
import Logo from '@/components/common/Logo';
import { useAuth } from '@/auth/AuthProvider';
import ProfilePopup from './ProfilePopup';

interface HeaderProps {
  title: string;
  projectName?: string; // 프로젝트명 추가
  designFileName?: string; // 디자인 파일명 추가
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
  // 파일 메뉴 관련 props 추가
  onNewProject?: () => void;
  onSaveAs?: () => void;
  onProjectNameChange?: (newName: string) => void;
  onDesignFileChange?: () => void; // 디자인 파일 선택/변경
  // 햄버거 메뉴 관련 props 추가
  onFileTreeToggle?: () => void;
  isFileTreeOpen?: boolean;
}

const Header: React.FC<HeaderProps> = ({
  title,
  projectName,
  designFileName,
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
  onDoorInstallationToggle,
  onNewProject,
  onSaveAs,
  onProjectNameChange,
  onDesignFileChange,
  onFileTreeToggle,
  isFileTreeOpen
}) => {
  const { user } = useAuth();
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const [isProfilePopupOpen, setIsProfilePopupOpen] = useState(false);
  const [profilePopupPosition, setProfilePopupPosition] = useState({ top: 60, right: 20 });
  const profileButtonRef = useRef<HTMLDivElement>(null);
  const fileMenuTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 디버깅용 로그
  console.log('🔍 Header 컴포넌트 title:', title);
  console.log('🔍 Header 컴포넌트 projectName:', projectName);

  // 컴포넌트 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (fileMenuTimeoutRef.current) {
        clearTimeout(fileMenuTimeoutRef.current);
      }
    };
  }, []);

  const handleHelpClick = () => {
    setIsHelpModalOpen(true);
  };

  const handleHelpClose = () => {
    setIsHelpModalOpen(false);
  };

  const handleFileMenuToggle = () => {
    console.log('📁 파일 메뉴 토글:', !isFileMenuOpen);
    // 타이머가 있으면 취소
    if (fileMenuTimeoutRef.current) {
      clearTimeout(fileMenuTimeoutRef.current);
      fileMenuTimeoutRef.current = null;
    }
    setIsFileMenuOpen(!isFileMenuOpen);
  };

  const handleFileMenuMouseEnter = () => {
    // 마우스가 들어오면 타이머 취소
    if (fileMenuTimeoutRef.current) {
      clearTimeout(fileMenuTimeoutRef.current);
      fileMenuTimeoutRef.current = null;
    }
  };

  const handleFileMenuMouseLeave = () => {
    // 마우스가 나가면 300ms 후에 메뉴 닫기
    fileMenuTimeoutRef.current = setTimeout(() => {
      setIsFileMenuOpen(false);
    }, 300);
  };

  const handleNewProject = () => {
    console.log('🆕 Header - 새디자인 버튼 클릭됨');
    console.log('🆕 Header - onNewProject 타입:', typeof onNewProject);
    setIsFileMenuOpen(false);
    onNewProject?.();
  };

  const handleSaveAs = () => {
    setIsFileMenuOpen(false);
    onSaveAs?.();
  };


  // 프로젝트 이름 변경 핸들러
  const handleProjectNameClick = () => {
    const currentName = projectName || 'Untitled';
    const newName = prompt('프로젝트 이름을 입력하세요:', currentName);
    if (newName && newName.trim() && newName.trim() !== currentName) {
      onProjectNameChange?.(newName.trim());
    }
  };

  // 프로필 클릭 핸들러
  const handleProfileClick = () => {
    if (profileButtonRef.current) {
      const rect = profileButtonRef.current.getBoundingClientRect();
      setProfilePopupPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right
      });
    }
    setIsProfilePopupOpen(!isProfilePopupOpen);
  };

  return (
    <header className={styles.header}>
      <div className={styles.container}>
        {/* 로고 영역 */}
        <div className={styles.logoSection}>
          {/* 햄버거 메뉴 버튼 */}
          <button 
            className={`${styles.hamburgerButton} ${isFileTreeOpen ? styles.active : ''}`}
            onClick={onFileTreeToggle}
            title="파일 트리 열기/닫기"
          >
            <Menu size={20} />
          </button>
          
          <div className={styles.logo}>
            <Logo size="medium" />
          </div>
          {designFileName && (
            <div className={styles.projectInfo}>
              <div className={styles.designFileName}>
                {designFileName}
              </div>
            </div>
          )}
        </div>

        {/* 중앙 액션 버튼들 */}
        <div className={styles.centerActions}>
          {/* 파일 드롭다운 메뉴 */}
          <div 
            className={styles.fileMenuContainer}
            onMouseEnter={handleFileMenuMouseEnter}
            onMouseLeave={handleFileMenuMouseLeave}
          >
            <button 
              className={styles.actionButton}
              onClick={handleFileMenuToggle}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2"/>
                <polyline points="14,2 14,8 20,8" stroke="currentColor" strokeWidth="2"/>
                <line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" strokeWidth="2"/>
                <line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" strokeWidth="2"/>
                <polyline points="10,9 9,9 8,9" stroke="currentColor" strokeWidth="2"/>
              </svg>
              파일
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ marginLeft: '4px' }}>
                <polyline points="6,9 12,15 18,9" stroke="currentColor" strokeWidth="2"/>
              </svg>
            </button>
            
            {isFileMenuOpen && (
              <div className={styles.fileDropdown}>
                <button 
                  className={styles.dropdownItem} 
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('🆕 Header - 새디자인 버튼 직접 클릭됨');
                    handleNewProject();
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2"/>
                    <polyline points="14,2 14,8 20,8" stroke="currentColor" strokeWidth="2"/>
                    <line x1="12" y1="18" x2="12" y2="12" stroke="currentColor" strokeWidth="2"/>
                    <line x1="9" y1="15" x2="15" y2="15" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                  새 디자인
                </button>
                <button 
                  className={styles.dropdownItem} 
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('💾 Header - 다른이름으로 저장 버튼 클릭됨');
                    handleSaveAs();
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" stroke="currentColor" strokeWidth="2"/>
                    <polyline points="17,21 17,13 7,13 7,21" stroke="currentColor" strokeWidth="2"/>
                    <polyline points="7,3 7,8 15,8" stroke="currentColor" strokeWidth="2"/>
                    <path d="M7 16h2v2H7z" stroke="currentColor" strokeWidth="1"/>
                  </svg>
                  다른이름으로 저장
                </button>
              </div>
            )}
          </div>

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
                <path d="M9 11l3 3L22 4" stroke="currentColor" strokeWidth="2" fill="none"/>
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke="currentColor" strokeWidth="2" fill="none"/>
              </svg>
              완료
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

          {/* 조작법 버튼 */}
          <button className={styles.actionButton} onClick={handleHelpClick}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" strokeWidth="2"/>
              <path d="M2 17l10 5 10-5" stroke="currentColor" strokeWidth="2"/>
              <path d="M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2"/>
            </svg>
            조작법
          </button>
        </div>

        {/* 우측 액션 버튼들 */}
        <div className={styles.rightActions}>
          {/* 설정 버튼 */}
          <button 
            className={styles.actionButton}
            onClick={() => setIsSettingsPanelOpen(true)}
            title="설정"
          >
            <Settings size={20} />
          </button>

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
            <div 
              ref={profileButtonRef}
              className={styles.userProfile} 
              onClick={handleProfileClick}
              style={{ cursor: 'pointer' }}
            >
              <div className={styles.userProfileAvatar}>
                {user?.photoURL && !imageError ? (
                  <img 
                    src={user.photoURL} 
                    alt={user.displayName || user.email || '사용자'} 
                    className={styles.profileImage}
                    onError={() => setImageError(true)}
                    onLoad={() => setImageError(false)}
                  />
                ) : (
                  <User size={16} />
                )}
              </div>
              <span className={styles.userProfileName}>
                {user?.displayName || user?.email?.split('@')[0] || '사용자'}
              </span>
            </div>
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
      
      {/* 조작법 모달 */}
      <HelpModal isOpen={isHelpModalOpen} onClose={handleHelpClose} />
      
      {/* 설정 패널 */}
      <SettingsPanel 
        isOpen={isSettingsPanelOpen}
        onClose={() => setIsSettingsPanelOpen(false)}
      />
      
      {/* 프로필 팝업 */}
      <ProfilePopup
        isOpen={isProfilePopupOpen}
        onClose={() => setIsProfilePopupOpen(false)}
        position={profilePopupPosition}
      />
    </header>
  );
};

export default Header; 