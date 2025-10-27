import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './Header.module.css';
import { Settings, Menu, User, ChevronDown, Camera, Undo, Redo } from 'lucide-react';
import { FaRegKeyboard } from 'react-icons/fa';
import { SiConvertio } from 'react-icons/si';
import HelpModal from './HelpModal';
import SettingsPanel from '@/components/common/SettingsPanel';
import Logo from '@/components/common/Logo';
import { useAuth } from '@/auth/AuthProvider';
import ProfilePopup from './ProfilePopup';
import { useTranslation } from '@/i18n/useTranslation';
import { useProjectStore } from '@/store/core/projectStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';
import { useHistoryStore } from '@/store/historyStore';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useTheme } from '@/contexts/ThemeContext';

interface HeaderProps {
  title: string;
  projectName?: string; // 프로젝트명 추가
  designFileName?: string; // 디자인 파일명 추가
  projectId?: string | null; // 프로젝트 ID 추가
  designFileId?: string | null; // 디자인 파일 ID 추가
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
  // 내보내기 관련 props
  onExportPDF?: () => void; // 실제로는 ConvertModal을 열어줌
}

const Header: React.FC<HeaderProps> = ({
  title,
  projectName,
  designFileName,
  projectId,
  designFileId,
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
  isFileTreeOpen,
  onExportPDF
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t, currentLanguage } = useTranslation();

  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const [isProfilePopupOpen, setIsProfilePopupOpen] = useState(false);
  const [profilePopupPosition, setProfilePopupPosition] = useState({ top: 60, right: 20 });
  const [isConvertMenuOpen, setIsConvertMenuOpen] = useState(false);
  const [isCameraMenuOpen, setIsCameraMenuOpen] = useState(false);
  // UIStore에서 카메라 및 그림자 설정 가져오기
  const { cameraMode, setCameraMode, shadowEnabled, setShadowEnabled } = useUIStore();
  const { colors } = useThemeColors();
  const { theme } = useTheme();
  const profileButtonRef = useRef<HTMLDivElement>(null);
  const fileMenuTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const convertMenuRef = useRef<HTMLDivElement>(null);
  const cameraMenuRef = useRef<HTMLDivElement>(null);
  
  // HistoryStore에서 undo/redo 기능 가져오기
  const { canUndo, canRedo, undo, redo } = useHistoryStore();
  const setSpaceInfo = useSpaceConfigStore(state => state.setSpaceInfo);
  const setPlacedModules = useFurnitureStore(state => state.setPlacedModules);
  const setBasicInfo = useProjectStore(state => state.setBasicInfo);

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
  
  // Undo 핸들러
  const handleUndo = () => {
    const previousState = undo();
    if (previousState) {
      setSpaceInfo(previousState.spaceInfo);
      setPlacedModules(previousState.placedModules);
      setBasicInfo(previousState.basicInfo);
    }
  };
  
  // Redo 핸들러
  const handleRedo = () => {
    const nextState = redo();
    if (nextState) {
      setSpaceInfo(nextState.spaceInfo);
      setPlacedModules(nextState.placedModules);
      setBasicInfo(nextState.basicInfo);
    }
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
    const currentName = projectName || t('project.untitled');
    const newName = prompt(t('project.enterName'), currentName);
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

  // 컨버팅 메뉴 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (convertMenuRef.current && !convertMenuRef.current.contains(event.target as Node)) {
        setIsConvertMenuOpen(false);
      }
    };

    if (isConvertMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isConvertMenuOpen]);

  // 카메라 메뉴 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (cameraMenuRef.current && !cameraMenuRef.current.contains(event.target as Node)) {
        setIsCameraMenuOpen(false);
      }
    };

    if (isCameraMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isCameraMenuOpen]);

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
              {t('common.file')}
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
                  {currentLanguage === 'ko' ? '새 디자인' : t('project.newProject')}
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
                  {t('project.saveAs')}
                </button>
              </div>
            )}
          </div>

          {/* 저장 버튼 - 파일 메뉴 바로 옆으로 이동 */}
          <button 
            className={styles.actionButton}
            onClick={() => {
              console.log('💾💾💾 [Header] 저장 버튼 클릭됨!');
              console.log('💾💾💾 [Header] onSave 함수 존재 여부:', !!onSave);
              console.log('💾💾💾 [Header] saving 상태:', saving);
              if (onSave) {
                console.log('💾💾💾 [Header] onSave 함수 호출 중...');
                onSave();
              } else {
                console.error('💾💾💾 [Header] onSave 함수가 없습니다!');
              }
            }}
            disabled={saving}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" stroke="currentColor" strokeWidth="2"/>
              <polyline points="17,21 17,13 7,13 7,21" stroke="currentColor" strokeWidth="2"/>
              <polyline points="7,3 7,8 15,8" stroke="currentColor" strokeWidth="2"/>
            </svg>
            {saving ? t('common.saving') : t('common.save')}
          </button>

          {/* Undo 버튼 */}
          <button 
            className={styles.actionButton}
            onClick={handleUndo}
            disabled={!canUndo()}
            title="실행 취소 (Ctrl+Z)"
          >
            <Undo size={20} />
          </button>
          
          {/* Redo 버튼 */}
          <button 
            className={styles.actionButton}
            onClick={handleRedo}
            disabled={!canRedo()}
            title="다시 실행 (Ctrl+Y)"
          >
            <Redo size={20} />
          </button>

          {onNext && (
            <button className={styles.actionButton} onClick={onNext}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M9 11l3 3L22 4" stroke="currentColor" strokeWidth="2" fill="none"/>
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke="currentColor" strokeWidth="2" fill="none"/>
              </svg>
              {t('common.finish')}
            </button>
          )}

          {onHelp && (
            <button className={styles.actionButton} onClick={onHelp}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                <path d="m9,9a3,3 0 1 1 5.83,1c0,2-3,3-3,3" stroke="currentColor" strokeWidth="2"/>
                <circle cx="12" cy="17" r="1" fill="currentColor"/>
              </svg>
              {t('common.help')}
            </button>
          )}

          {/* 조작법 버튼 */}
          <button className={styles.actionButton} onClick={handleHelpClick}>
            <FaRegKeyboard size={20} />
            {t('help.title')}
          </button>

          {/* 카메라 설정 드롭다운 */}
          <div className={styles.dropdownContainer} ref={cameraMenuRef}>
            <button 
              className={styles.actionButton}
              onClick={() => setIsCameraMenuOpen(!isCameraMenuOpen)}
            >
              <Camera size={20} />
              카메라
              <ChevronDown size={16} style={{ marginLeft: '4px' }} />
            </button>
            
            {isCameraMenuOpen && (
              <div className={styles.dropdownMenu}>
                <button
                  className={`${styles.dropdownItem} ${cameraMode === 'perspective' ? styles.active : ''}`}
                  onClick={() => {
                    setCameraMode('perspective');
                    setIsCameraMenuOpen(false);
                  }}
                >
                  <span className={styles.checkmark}>
                    {cameraMode === 'perspective' && '✓'}
                  </span>
                  Perspective
                </button>
                <button
                  className={`${styles.dropdownItem} ${cameraMode === 'orthographic' ? styles.active : ''}`}
                  onClick={() => {
                    setCameraMode('orthographic');
                    setIsCameraMenuOpen(false);
                  }}
                >
                  <span className={styles.checkmark}>
                    {cameraMode === 'orthographic' && '✓'}
                  </span>
                  Orthographic
                </button>
              </div>
            )}
          </div>

          {/* 그림자 토글 스위치 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>그림자</span>
            <div
              onClick={() => setShadowEnabled(!shadowEnabled)}
              style={{
                position: 'relative',
                width: '36px',
                height: '20px',
                backgroundColor: shadowEnabled ? 'var(--theme-primary)' : (theme.mode === 'dark' ? 'rgba(128,128,128,0.3)' : 'rgba(200,200,200,0.5)'),
                borderRadius: '10px',
                cursor: 'pointer',
                transition: 'background-color 0.3s ease',
                display: 'flex',
                alignItems: 'center',
                padding: '2px'
              }}
              title={shadowEnabled ? '그림자 끄기' : '그림자 켜기'}
            >
              <div
                style={{
                  width: '16px',
                  height: '16px',
                  backgroundColor: theme.mode === 'dark' ? '#1a1a1a' : '#ffffff',
                  borderRadius: '50%',
                  transition: 'transform 0.3s ease, background-color 0.3s ease',
                  transform: shadowEnabled ? 'translateX(16px)' : 'translateX(0)',
                  boxShadow: theme.mode === 'dark' ? '0 2px 4px rgba(0,0,0,0.5)' : '0 2px 4px rgba(0,0,0,0.2)'
                }}
              />
            </div>
          </div>
        </div>

        {/* 우측 액션 버튼들 */}
        <div className={styles.rightActions}>
          {/* 설정 버튼 */}
          <button 
            className={styles.actionButton}
            onClick={() => setIsSettingsPanelOpen(true)}
            title={t('settings.title')}
          >
            <Settings size={20} />
          </button>

          {/* 내보내기 버튼 */}
          {onExportPDF && (
            <button 
              className={styles.convertButton} 
              onClick={() => {
                console.log('내보내기 버튼 클릭됨');
                onExportPDF(); // PDF 핸들러가 실제로는 ConvertModal을 열어줌
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ marginRight: '4px' }}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="2"/>
                <polyline points="7,10 12,15 17,10" stroke="currentColor" strokeWidth="2"/>
                <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" strokeWidth="2"/>
              </svg>
              {t('export.title')}
            </button>
          )}

          {/* CNC 옵티마이저 버튼 */}
          <div className={styles.convertButtonContainer} ref={convertMenuRef}>
            <button
              className={styles.convertButton}
              onClick={() => setIsConvertMenuOpen(!isConvertMenuOpen)}
            >
              <SiConvertio size={20} />
              {t('common.converting')}
              <ChevronDown size={16} style={{ marginLeft: '4px' }} />
            </button>
            
            {isConvertMenuOpen && (
              <div className={styles.dropdownMenu}>
                <button 
                  className={styles.dropdownItem}
                  onClick={() => {
                    console.log('CNC 옵티마이저 버튼 클릭됨');
                    
                    // 현재 전체 상태를 sessionStorage에 저장
                    const currentState = {
                      projectId,
                      designFileId,
                      basicInfo: useProjectStore.getState().basicInfo,
                      spaceInfo: useSpaceConfigStore.getState().spaceInfo,
                      placedModules: useFurnitureStore.getState().placedModules,
                      timestamp: Date.now()
                    };
                    sessionStorage.setItem('configurator_state_backup', JSON.stringify(currentState));
                    console.log('💾 Configurator 상태 백업 완료');
                    
                    // 프로젝트 ID와 디자인 파일 ID를 URL 파라미터로 전달
                    const params = new URLSearchParams();
                    if (projectId) params.set('projectId', projectId);
                    if (designFileId) params.set('designFileId', designFileId);
                    const queryString = params.toString();
                    
                    // state로 현재 페이지 정보 전달
                    navigate(`/cnc-optimizer${queryString ? `?${queryString}` : ''}`, {
                      state: { fromConfigurator: true }
                    });
                    setIsConvertMenuOpen(false);
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ marginRight: '8px' }}>
                    <rect x="3" y="3" width="18" height="18" stroke="currentColor" strokeWidth="2"/>
                    <line x1="3" y1="9" x2="21" y2="9" stroke="currentColor" strokeWidth="2"/>
                    <line x1="9" y1="3" x2="9" y2="21" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                  {t('export.cuttingOptimizer')}
                </button>
                
                {onConvert && (
                  <button 
                    className={styles.dropdownItem}
                    onClick={() => {
                      onConvert();
                      setIsConvertMenuOpen(false);
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ marginRight: '8px' }}>
                      <rect x="3" y="3" width="7" height="7" stroke="currentColor" strokeWidth="2"/>
                      <rect x="14" y="3" width="7" height="7" stroke="currentColor" strokeWidth="2"/>
                      <rect x="3" y="14" width="7" height="7" stroke="currentColor" strokeWidth="2"/>
                      <rect x="14" y="14" width="7" height="7" stroke="currentColor" strokeWidth="2"/>
                    </svg>
                    {t('export.drawingEditor')}
                  </button>
                )}
              </div>
            )}
          </div>

          {user ? (
            <>
              {onLogout && (
                <button className={styles.logoutButton} onClick={onLogout}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="2"/>
                    <polyline points="16,17 21,12 16,7" stroke="currentColor" strokeWidth="2"/>
                    <line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                  {currentLanguage === 'ko' ? '로그아웃' : t('common.logout')}
                </button>
              )}

              {/* 프로필은 항상 표시 - onProfile이 없어도 표시 */}
              <div 
                ref={profileButtonRef}
                className={styles.userProfile} 
                onClick={onProfile ? handleProfileClick : undefined}
                style={{ cursor: onProfile ? 'pointer' : 'default' }}
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
            </>
          ) : (
            <button 
              className={styles.loginButton} 
              onClick={() => navigate('/login')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" stroke="currentColor" strokeWidth="2"/>
                <polyline points="10 17 15 12 10 7" stroke="currentColor" strokeWidth="2"/>
                <line x1="15" y1="12" x2="3" y2="12" stroke="currentColor" strokeWidth="2"/>
              </svg>
              {currentLanguage === 'ko' ? '로그인' : t('common.login')}
            </button>
          )}
        </div>
      </div>

      {/* 저장 상태 표시 */}
      {saveStatus === 'success' && (
        <div className={styles.saveSuccess}>
          ✓ {t('messages.saveSuccess')}
        </div>
      )}
      {saveStatus === 'error' && (
        <div className={styles.saveError}>
          ✕ {t('messages.saveFailed')}
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